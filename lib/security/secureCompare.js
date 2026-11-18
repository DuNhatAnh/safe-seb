// So sanh chuoi chong timing attack (bam truoc de 2 ben cung do dai)
const crypto = require("crypto");

function secureCompare(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { secureCompare };
