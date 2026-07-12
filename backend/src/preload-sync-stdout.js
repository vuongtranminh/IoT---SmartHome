// Force line-buffered / synchronous stdout khi output vào file (không phải TTY).
// Ngăn ngừa log bị mất khi process bị kill trước khi buffer 8KB flush.
if (process.stdout._handle && process.stdout._handle.setBlocking) {
  process.stdout._handle.setBlocking(true);
}
if (process.stderr._handle && process.stderr._handle.setBlocking) {
  process.stderr._handle.setBlocking(true);
}
