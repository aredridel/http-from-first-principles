var net = require('net');
// Because we're building HTTP on top of raw TCP

var url = require('url');
// We need to parse URLs into their parts -- the host and port and path are most interesting.

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

        // Just passing back c, raw, with whatever the server sends isn't a good interface but it's enough for now.
        return c;

    }
}
