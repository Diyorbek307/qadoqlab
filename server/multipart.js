'use strict';

// Minimal multipart/form-data parser for the two upload forms. The body is size-limited
// before it gets here. Client file names are kept only as metadata and never used as paths.

function parseMultipart(buf, contentType, { maxParts = 40 } = {}) {
  const match = /boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i.exec(contentType || '');
  if (!match) throw new Error('no_boundary');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);

  const fields = Object.create(null);
  const files = [];
  let pos = buf.indexOf(boundary);
  if (pos === -1) throw new Error('bad_body');

  for (let count = 0; pos !== -1; count += 1) {
    let start = pos + boundary.length;
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // closing "--"
    if (count >= maxParts) throw new Error('bad_body');
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;

    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1 || headerEnd - start > 2048) throw new Error('bad_part');
    const head = buf.subarray(start, headerEnd).toString('utf8');
    const next = buf.indexOf(boundary, headerEnd + 4);
    if (next === -1) throw new Error('bad_part');
    const data = buf.subarray(headerEnd + 4, next - 2); // minus the CRLF before the boundary

    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(head);
    const name = disposition && (/\bname="([^"]{1,64})"/i.exec(disposition[1]) || [])[1];
    if (name) {
      const filename = (/\bfilename="([^"]*)"/i.exec(disposition[1]) || [])[1];
      if (filename !== undefined) {
        if (data.length > 0) files.push({ field: name, clientName: filename.slice(0, 200), data });
      } else if (!(name in fields)) {
        fields[name] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, files };
}

// File type by its first bytes, not by extension or the browser's claim.
function sniffType(data) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length >= 8 && data.subarray(0, 8).equals(png)) return { mime: 'image/png', ext: 'png' };
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

module.exports = { parseMultipart, sniffType };
