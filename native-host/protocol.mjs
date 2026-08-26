import { AppError } from "./core.mjs";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 900 * 1024;

export async function readNativeMessage(stream, maxBytes = MAX_REQUEST_BYTES) {
  let buffer = Buffer.alloc(0);
  let expectedLength = null;

  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);

    if (expectedLength === null && buffer.length >= 4) {
      expectedLength = buffer.readUInt32LE(0);
      if (expectedLength === 0 || expectedLength > maxBytes) {
        throw new AppError("PROTOCOL_ERROR", "Native message length is invalid.");
      }
    }

    if (expectedLength !== null && buffer.length >= expectedLength + 4) {
      const body = buffer.subarray(4, expectedLength + 4).toString("utf8");
      try {
        return JSON.parse(body);
      } catch {
        throw new AppError("PROTOCOL_ERROR", "Native message is not valid JSON.");
      }
    }
  }

  throw new AppError("PROTOCOL_ERROR", "Native message ended before a complete request was received.");
}

export function encodeNativeMessage(message, maxBytes = MAX_RESPONSE_BYTES) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > maxBytes) {
    throw new AppError("OUTPUT_TOO_LARGE", "Native response exceeds Chrome's message size limit.");
  }

  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}
