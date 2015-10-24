http-from-first-principles
==========================

The commits on this repo are individually interesting, since they show chunks
of progress from a stupid naive protocol handler, through some of the thought
required to deal with the fact that chunks come in off the wire in varying
sizes and with boundaries that can be in the middle of things like headers that
we do want to care about.

this ends up as a complete http 1.1 client for text-only use cases, that don't
use HTTP Chunked transfer-encoding. It's a minimum viable http, as it were.
It'll mangle binary data, it doesn't keep the status code separate from other
headers, it's pretty naive. but it shows off the tricks of parsing
incrementally with data as it comes over the wire. The test suite ain't bad
either, and shows off some tricks for using a real live http server for testing
on an ephemeral port.

If this project is useful to you, say hi! I'd love to hear from you.

Aria Stewart <aredridel@dinhe.net>
