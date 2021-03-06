"use strict";
// Because Aria can't remember what variable names she's used.
// This makes global assignment an error at least.

var net = require('net');
// Because we're building HTTP on top of raw TCP

var url = require('url');
// We need to parse URLs into their parts -- the host and port and path are most interesting.

var stream = require('stream');
// Get ourselves stream.PassThrough, so we can use that as the 
// interface our callers will see for body data -- a response from HTTP 
// is "some headers" plus "a body (that could be really big so we'll use a stream)"

var through2 = require('through2');
// through2 is a stream library that's great. Pipe data in, through a function, and out the
// other side. It builds on stream.PassThrough. We stand on the shoulders of giants. (Or
// really, rvagg makes great stuff.)

module.exports = {
    request: function (uri, method, body) {
        var u = url.parse(uri);

        var c = net.createConnection({ host: u.hostname, port: u.port || 80 }); // No https for us! It's complicated.

        // The minimal HTTP/1.1 request:
        // GET / HTTP/1.1
        // Host: foo.com
        // <this line blank>
        c.write(method + " " + u.path + " HTTP/1.1\r\n");
        c.write("Host: " + u.host + "\r\n");
        // We could write request headers here. Eventually we could create an interface for that.
        c.write("\r\n"); // End of header -- a blank line.

        if (method == 'HEAD' || method == 'GET') {
            // HEAD is just like GET, only the client tells the server they don't want the data, just the metadata.
            // Web crawlers use it to make the check if something is fresh cheap, sometimes.
            c.end();
        } else {
            c.end(body);
        }

        // A place to put the (coming) body, separate from what we receive,
        // so we can receive headers and handle them ourself.
        // Data goes in one side, comes out the other. One of the simplest streams.
        var response = new stream.PassThrough();

        response.headers = {};
        // We will postprocess the headers later into this object.

        // A simple list of the raw header lines. We'll do more with them later,
        // but sometimes callers want to see the details.
        response.rawHeaders = [];

        // We're in headers until we find the body. We'll flip this switch once we
        // find that `\r\n` that ends the headers.
        var inBody = false;

        // We may get some chunk of data like "ontent-Type: text/htm" so we need a
        // place to keep it until the next chunk completes it.
        var partial = '';

        c.pipe(through2(function divideHeadersFromBody(data, _, next) {
            // So through2 takes two functions: the first gets called for each
            // chunk of incoming data, in order. It won't give us the next one
            // until we call next(), so we never have two chunks being processed
            // at the same time.
            //
            // If we forget to call next(), our stream will just never end
            // and things may hang.
            //
            // The second function is optional, used if we need to do anything at
            // the end of the stream. We don't, since we just pipe any remainder
            // on blindly to our caller.

            // For simplicity, we're going to _completely_ ignore that binary
            // data like images are a thing that could ever exist.
            data = data.toString();

            // Here we figure out if data is header, body, or some of each.
            // This function gets called for each chunk of data, and we
            // decide whether to pass it on (this.push(data)), keep it for ourselves,
            // or split it apart and pass some on (this.push(somepart))
            //
            // There are a lot of cases:
            //
            // - partial previous data = '', data = a partial header;
            // - partial = partial header, data = partial header + more headers
            // - partial = empty, data = headers + body
            // - partial = partial header, data = partial header + more headers + body...
            // - more combinations
            //
            // You get the idea. It's that maybe-partial-stuff that complicates.
            //
            // We keep ourselves from going crazy by breaking it down into the smallest pieces
            // and only dealing with the first of each. That means that the remaining cases
            // become versions of the simple cases. Woo parsing. Doubly so with streams where
            // you have arbitrary chunk boundaries. Like TCP, which HTTP is built on top of.

            while (data) {
                if (inBody) {
                    // We just pass along the body as it's received. We only have to parse
                    // headers. If we flipped the `inBody` switch, it means we are now in
                    // short-circuit mode, just passing along this remainder.
                    //
                    // This is the only place stuff gets pushed on to our caller -- only
                    // body is passed on. Headers are completely absorbed by us, processed
                    // into an object, and returned as a property on response -- much more
                    // useful so the caller doesn't have to do what we're doing in this module.
                    this.push(data);

                    // Stop processing here and let the next chunk flow in.
                    return next();
                }

                // We'll deal with data in bits, chopping some off each time until we deal
                // with it all. A while loop is a nice simple way.

                var m = /\r?\n/.exec(data);
                // `\r` is "carriage return", and `\n` is "newline" -- Unix only cares about `\n`,
                // but HTTP is an IETF protocol, and the standard line ending is actually DOS line
                // ends. But lots of unix systems forget the `\r`, so it's optional. But expected.

                if (m) {
                    // If there's a \n, we found a header line -- from start to \n.

                    // We take anything we'd stored and add it to our bit to make a complete header.
                    var potentialHeader = partial + m.input.slice(0, m.index);

                    // Since we used up any previous partial piece if there was one, we clear it.
                    partial = '';

                    // We slice off what we just added, saving further data for another header.
                    // This could end the while loop, if the end of this chunk is also the end of a header.
                    data = data.slice(m.index + m[0].length);

                    if (potentialHeader) {
                        response.rawHeaders.push(potentialHeader);
                    } else {
                        // At this point, data is the start of the body, and since we've flipped
                        // this bit, the next spin of the while loop will do the right thing.
                        inBody = true;

                        // We have a complete set of headers, so let's post-process them into the
                        // more useful response.headers object.
                        completeHeaders();
                    }
                } else {
                    // No \r?\n, so we must have partial data, and just save it for the next go round.
                    // Hypothetically, data could equal "ntent-Type: text/ht" here and partial could
                    // equal "Co" ?-- neither a complete start nor end of a header.
                    // If there's partial stuff from before, we add to it.
                    partial = partial + data;

                    // And since we saved it, clear it out. Oh hey, and it ends the while loop. This chunk is _done_.
                    data = '';
                }
            }

            next(); // Ready for next chunk.
        })).pipe(response);
        // Whatever comes out of our header-splitting stream parser must be the
        // body. Because that's what we designed, right?

        return response; // Not a terrible interface. Headers in response.headers, body as the stream.

        function completeHeaders() {
            response.rawHeaders.forEach(function (header) {
                var pair = header.split(/: ?/, 2);
                response.headers[pair[0].toLowerCase()] = pair[1];
            });
        }
    }
}
