module.exports = async () => {
  const child = global.__TESTDB_CHILD__;
  if (!child) return;
  await new Promise((resolve) => {
    child.on('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(resolve, 8000);
  });
};
