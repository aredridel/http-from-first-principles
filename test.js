// tap is our test harness
var tap = require('tap');

// We use the node http module to create a server to use while testing
var http = require('http');

// bl = "buffer list" -- it's a stream sink, it collects everything the
// stream emits as a pile of buffers, and gives it to you in one chunk
// at the end. Great module.
var bl = require('bl');

// client is the library we're making, the subject under test
var client = require('./');

tap.test('the library loads a thing', function (t) {
    t.ok(client);
    t.equal(typeof client.request, 'function');
    t.end();
});

tap.test('makes a simple GET request', function (t) {
    var server = http.createServer(function (req, res) {
        t.pass('Got request');
        t.equal(req.url, '/');
        res.end('Hello');
        server.close();
    }).listen(0, function () { // 0 means "Hey, Operating system! Assign us any free port!"
        var res = client.request("http://localhost:" + server.address().port + "/", 'GET');
        res.pipe(bl(function (err, data) {
            t.error(err);
            t.ok(res.headers, 'We get a headers object');
            t.ok(res.rawHeaders, 'We get a rawHeaders array');
            t.ok(res.rawHeaders.length, "We got headers in the array");
            console.warn(res.rawHeaders); // Let's see our work!
            // t.equal(data.toString(), 'Hello', 'Data is just the body'); Will fix this later.
            t.end();
        }));
    });
});
