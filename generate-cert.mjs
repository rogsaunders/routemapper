// generate-cert.mjs
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const certPath = path.resolve("./localhost.pem");
const keyPath = path.resolve("./localhost-key.pem");

// Check if certificates already exist
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log("✅ Certificates already exist");
  process.exit(0);
}

console.log("🔐 Generating SSL certificate...");

try {
  // Generate a proper certificate with modern settings
  const command = `openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 365 \
    -keyout "${keyPath}" \
    -out "${certPath}" \
    -subj "/C=US/ST=State/L=City/O=RallyMapper/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.0.120"`;

  execSync(command, { stdio: "inherit" });

  console.log("✅ Certificate generated successfully!");
  console.log("📁 Files created:");
  console.log("   - localhost.pem (certificate)");
  console.log("   - localhost-key.pem (private key)");
} catch (error) {
  console.error("❌ Error generating certificate:", error.message);
  console.log("\n💡 Try running this command manually:");
  console.log(
    'openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 365 -keyout localhost-key.pem -out localhost.pem -subj "/C=US/ST=State/L=City/O=RallyMapper/CN=localhost"'
  );
}
