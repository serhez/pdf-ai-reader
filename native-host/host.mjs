#!/usr/bin/env node

import { handleRequest, errorResponse } from "./handler.mjs";
import { encodeNativeMessage, readNativeMessage } from "./protocol.mjs";

let requestId = null;

try {
  const request = await readNativeMessage(process.stdin);
  requestId = typeof request?.id === "string" ? request.id : null;
  const response = await handleRequest(request);
  process.stdout.write(encodeNativeMessage(response));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  let response = errorResponse(error, requestId);
  try {
    process.stdout.write(encodeNativeMessage(response));
  } catch {
    response = errorResponse(new Error("Response could not be encoded."), requestId);
    process.stdout.write(encodeNativeMessage(response));
  }
}
