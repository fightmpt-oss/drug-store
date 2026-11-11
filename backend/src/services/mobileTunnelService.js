const os = require('os');
const QRCode = require('qrcode');

/**
 * ค้นหา IPv4 ในวงแลน (Wi-Fi / Ethernet) ของเครื่องคอมพิวเตอร์แม่ข่ายห้องยา รพ.สต.
 */
function getLanAddresses(port = 5000) {
  const interfaces = os.networkInterfaces();
  const list = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!Array.isArray(addrs)) continue;
    const lowerName = name.toLowerCase();
    // ข้าม virtual adapter เช่น WSL, Hyper-V, VirtualBox, Docker, VMware, Loopback
    if (
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('virtual') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vbox') ||
      lowerName.includes('docker') ||
      lowerName.includes('loopback')
    ) {
      continue;
    }

    for (const addr of addrs) {
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4;
      if (isIPv4 && !addr.internal && addr.address && !addr.address.startsWith('169.254.')) {
        const isWifi = lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless');
        list.push({
          interfaceName: name,
          ip: addr.address,
          url: `http://${addr.address}:${port}`,
          isWifi
        });
      }
    }
  }

  // จัดลำดับ: เอา Wi-Fi และ 192.168.x.x ขึ้นก่อน เพื่อความถูกต้องของวงแลน รพ.สต.
  list.sort((a, b) => {
    if (a.isWifi !== b.isWifi) return a.isWifi ? -1 : 1;
    const a192 = a.ip.startsWith('192.168.');
    const b192 = b.ip.startsWith('192.168.');
    if (a192 !== b192) return a192 ? -1 : 1;
    return a.ip.localeCompare(b.ip);
  });

  return list;
}

/**
 * ดึงข้อมูลการเชื่อมต่อมือถือผ่าน Wi-Fi วงแลนเดียวกัน (ถาวร 100% ไม่เปลี่ยนตาม Cloudflare)
 */
async function getMobileBridgeInfo({ port = 5000, mobileToken = null, drugcode = null } = {}) {
  const lanList = getLanAddresses(port);
  const primaryLanUrl = lanList[0]?.url || `http://localhost:${port}`;

  const buildTargetUrl = (baseUrl) => {
    if (!baseUrl) return null;
    const params = new URLSearchParams();
    params.set('tab', 'substock-qr');
    params.set('mobile', '1');
    if (mobileToken) params.set('mobile_token', mobileToken);
    if (drugcode) params.set('scan', drugcode);
    return `${baseUrl}/?${params.toString()}`;
  };

  const lanConnectUrl = buildTargetUrl(primaryLanUrl);
  let lanQrDataUrl = null;

  try {
    lanQrDataUrl = await QRCode.toDataURL(lanConnectUrl, {
      width: 300,
      margin: 1,
      color: { dark: '#064e3b', light: '#ffffff' }
    });
  } catch (e) {}

  return {
    primaryLanUrl,
    lanConnectUrl,
    lanQrDataUrl,
    lanAddresses: lanList
  };
}

module.exports = {
  getLanAddresses,
  getMobileBridgeInfo
};
