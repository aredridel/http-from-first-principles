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
        response.headers = {}; // Look! Fake headers!

        c.pipe(through2(function divideHeadersFromBody(data, _, next) {
            // Here we figure out if data is header, body, or some of each.
            // This function gets called for each chunk of data, and we
            // decide whether to pass it on (this.push(data)), keep it for ourselves,
            // or split it apart and pass some on (this.push(somepart))

            this.push(data) // Just pass it on.
            next(); // Ready for next chunk.
        })).pipe(response);
        // Whatever comes out of our header-splitting stream parser must be the
        // body. Because that's what we designed, right?

        return response; // Not a terrible interface. Headers in response.headers, body as the stream.
    }
}
