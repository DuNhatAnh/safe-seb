// Diem vao Vercel: moi /api/* duoc rewrite ve day (xem vercel.json)
const { handle } = require("../lib/api");

module.exports = (req, res) => handle(req, res);
