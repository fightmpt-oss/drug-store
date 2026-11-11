// Realistic Thai PCU / รพ.สต. Drug Inventory Master & Dispensing Dataset
// Supports realistic simulation & offline demonstration when JHCIS MySQL is not yet configured

const mockDrugs = [
  {
    drugcode: '0001',
    didstandard: '201010000000000001001421', // 24-digit TMT
    drugname: 'Paracetamol 500 mg tablet',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '500 เม็ด/กระปุก',
    costprice: 0.35,
    minstock: 2000,
    maxstock: 8000,
    location: 'ตู้ยา A-01'
  },
  {
    drugcode: '0002',
    didstandard: '201010000000000002001432',
    drugname: 'Amoxicillin 500 mg capsule',
    drugtype: 'แคปซูล',
    drugunit: 'แคปซูล',
    unitpacking: '500 แคปซูล/กระปุก',
    costprice: 1.20,
    minstock: 1500,
    maxstock: 5000,
    location: 'ตู้ยา A-02'
  },
  {
    drugcode: '0003',
    didstandard: '201010000000000003001443',
    drugname: 'Amlodipine 5 mg tablet',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '100 เม็ด/กล่อง',
    costprice: 0.50,
    minstock: 3000,
    maxstock: 12000,
    location: 'ตู้ยา NCD-01'
  },
  {
    drugcode: '0004',
    didstandard: '201010000000000004001454',
    drugname: 'Metformin 500 mg tablet',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '500 เม็ด/กระปุก',
    costprice: 0.40,
    minstock: 4000,
    maxstock: 15000,
    location: 'ตู้ยา NCD-02'
  },
  {
    drugcode: '0005',
    didstandard: '201010000000000005001465',
    drugname: 'Omeprazole 20 mg capsule',
    drugtype: 'แคปซูล',
    drugunit: 'แคปซูล',
    unitpacking: '100 แคปซูล/กล่อง',
    costprice: 0.85,
    minstock: 1000,
    maxstock: 4000,
    location: 'ตู้ยา B-01'
  },
  {
    drugcode: '0006',
    didstandard: '201010000000000006001476',
    drugname: 'Losartan 50 mg tablet',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '30 เม็ด/กล่อง',
    costprice: 1.80,
    minstock: 2500,
    maxstock: 8000,
    location: 'ตู้ยา NCD-03'
  },
  {
    drugcode: '0007',
    didstandard: '201010000000000007001487',
    drugname: 'Simvastatin 20 mg tablet',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '100 เม็ด/กล่อง',
    costprice: 0.90,
    minstock: 2000,
    maxstock: 7000,
    location: 'ตู้ยา NCD-04'
  },
  {
    drugcode: '0008',
    didstandard: '201010000000000008001498',
    drugname: 'Chlorpheniramine 4 mg tablet (CPM)',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '1000 เม็ด/กระปุก',
    costprice: 0.15,
    minstock: 1000,
    maxstock: 5000,
    location: 'ตู้ยา A-03'
  },
  {
    drugcode: '0009',
    didstandard: '201010000000000009001509',
    drugname: 'Salbutamol Inhaler (Ventolin) 200 doses',
    drugtype: 'ยาพ่น',
    drugunit: 'หลอด',
    unitpacking: '1 หลอด/กล่อง',
    costprice: 120.00,
    minstock: 20,
    maxstock: 80,
    location: 'ตู้ยาฉุกเฉิน C-01'
  },
  {
    drugcode: '0010',
    didstandard: '201010000000000010001510',
    drugname: 'ORS ผงน้ำตาลเกลือแร่ (รสส้ม)',
    drugtype: 'ผงละลายน้ำ',
    drugunit: 'ซอง',
    unitpacking: '50 ซอง/กล่อง',
    costprice: 3.50,
    minstock: 300,
    maxstock: 1200,
    location: 'ตู้ยา B-02'
  },
  {
    drugcode: '0011',
    didstandard: '201010000000000011001521',
    drugname: 'Erythromycin Dry Syrup 125mg/5mL 60mL',
    drugtype: 'ยาน้ำ',
    drugunit: 'ขวด',
    unitpacking: '1 ขวด/กล่อง',
    costprice: 28.00,
    minstock: 50,
    maxstock: 200,
    location: 'ตู้ยาเด็ก D-01'
  },
  {
    drugcode: '733',
    didstandard: '201010000007330000001533',
    drugname: 'CAFEGOT',
    drugnamethai: 'คาเฟอร์กอต',
    druggenericname: 'Ergotamine tartrate 1 mg + Caffeine 100 mg',
    drugtype: 'ยาเม็ด',
    drugunit: 'เม็ด',
    unitpacking: '10 เม็ด/แผง',
    costprice: 2.50,
    minstock: 100,
    maxstock: 1000,
    location: 'ตู้ยา A-04'
  }
];

// Lot-level stock receipts (from hospital delivery batches)
const mockReceipts = [
  // Paracetamol
  {
    receiveno: 'REC-2026-06-01',
    receivedate: '2026-06-05',
    supplier: 'รพ.แม่ข่ายประจำอำเภอ',
    items: [
      { drugcode: '0001', lotno: 'LOT-PARA-2401', dateexpire: '2026-11-15', amount: 3000, costprice: 0.35 }, // Near Expire (< 2 months from current date Sept 2026)
      { drugcode: '0002', lotno: 'LOT-AMOX-2405', dateexpire: '2027-05-20', amount: 2000, costprice: 1.20 },
      { drugcode: '0003', lotno: 'LOT-AMLO-2402', dateexpire: '2027-12-10', amount: 4000, costprice: 0.50 },
      { drugcode: '0004', lotno: 'LOT-METF-2408', dateexpire: '2028-02-14', amount: 5000, costprice: 0.40 }
    ]
  },
  {
    receiveno: 'REC-2026-08-01',
    receivedate: '2026-08-10',
    supplier: 'รพ.แม่ข่ายประจำอำเภอ',
    items: [
      { drugcode: '0001', lotno: 'LOT-PARA-2503', dateexpire: '2028-08-20', amount: 4000, costprice: 0.35 },
      { drugcode: '0005', lotno: 'LOT-OMEP-2410', dateexpire: '2026-12-25', amount: 1500, costprice: 0.85 }, // Near Expire (< 3 months)
      { drugcode: '0006', lotno: 'LOT-LOSA-2501', dateexpire: '2028-04-30', amount: 3000, costprice: 1.80 },
      { drugcode: '0007', lotno: 'LOT-SIMV-2502', dateexpire: '2028-01-15', amount: 2500, costprice: 0.90 },
      { drugcode: '0009', lotno: 'LOT-VENT-2403', dateexpire: '2026-08-10', amount: 25, costprice: 120.00 } // EXPIRED in Aug 2026!
    ]
  },
  {
    receiveno: 'REC-2026-04-15',
    receivedate: '2026-04-15',
    supplier: 'รพ.แม่ข่ายประจำอำเภอ',
    items: [
      { drugcode: '0008', lotno: 'LOT-CPM-2309', dateexpire: '2027-09-30', amount: 2000, costprice: 0.15 },
      { drugcode: '0010', lotno: 'LOT-ORS-2401', dateexpire: '2027-10-15', amount: 500, costprice: 3.50 },
      { drugcode: '0011', lotno: 'LOT-ERYT-2301', dateexpire: '2027-06-30', amount: 80, costprice: 28.00 } // Slow moving / Dead stock!
    ]
  }
];

// Patient dispensing history from JHCIS `visitdrug` & `visit`
// Simulated across June, July, August, September 2026
const mockDispensing = [
  // Paracetamol 500 mg (Regular heavy usage ~ 1,800 - 2,200 tablets/month)
  { date: '2026-06-12', drugcode: '0001', unit: 300, visitno: '69060012' },
  { date: '2026-06-25', drugcode: '0001', unit: 650, visitno: '69060088' },
  { date: '2026-07-08', drugcode: '0001', unit: 550, visitno: '69070024' },
  { date: '2026-07-22', drugcode: '0001', unit: 800, visitno: '69070112' },
  { date: '2026-08-05', drugcode: '0001', unit: 900, visitno: '69080031' },
  { date: '2026-08-19', drugcode: '0001', unit: 750, visitno: '69080095' },
  { date: '2026-09-02', drugcode: '0001', unit: 850, visitno: '69090014' },
  { date: '2026-09-18', drugcode: '0001', unit: 920, visitno: '69090076' },

  // Amoxicillin 500 mg (Antibiotic ~ 500 - 600 capsules/month)
  { date: '2026-06-15', drugcode: '0002', unit: 200, visitno: '69060045' },
  { date: '2026-07-10', drugcode: '0002', unit: 250, visitno: '69070055' },
  { date: '2026-08-12', drugcode: '0002', unit: 300, visitno: '69080062' },
  { date: '2026-09-10', drugcode: '0002', unit: 350, visitno: '69090040' },

  // Amlodipine 5 mg (Chronic NCD clinic ~ 2,500 - 3,000 tablets/month, HIGH USAGE -> LOW STOCK!)
  { date: '2026-06-20', drugcode: '0003', unit: 1200, visitno: '69060077' },
  { date: '2026-07-18', drugcode: '0003', unit: 1400, visitno: '69070099' },
  { date: '2026-08-20', drugcode: '0003', unit: 1300, visitno: '69080104' },
  { date: '2026-09-22', drugcode: '0003', unit: 1400, visitno: '69090098' }, // Total received 4000, dispensed 5300! Low Stock!

  // Metformin 500 mg (Chronic DM ~ 2,000 tablets/month)
  { date: '2026-06-20', drugcode: '0004', unit: 1000, visitno: '69060078' },
  { date: '2026-07-18', drugcode: '0004', unit: 1100, visitno: '69070100' },
  { date: '2026-08-20', drugcode: '0004', unit: 1050, visitno: '69080105' },
  { date: '2026-09-22', drugcode: '0004', unit: 1200, visitno: '69090099' },

  // Omeprazole 20 mg
  { date: '2026-08-15', drugcode: '0005', unit: 300, visitno: '69080080' },
  { date: '2026-09-12', drugcode: '0005', unit: 350, visitno: '69090051' },

  // Losartan 50 mg
  { date: '2026-08-20', drugcode: '0006', unit: 900, visitno: '69080106' },
  { date: '2026-09-22', drugcode: '0006', unit: 1000, visitno: '69090100' },

  // Simvastatin 20 mg
  { date: '2026-08-20', drugcode: '0007', unit: 800, visitno: '69080107' },
  { date: '2026-09-22', drugcode: '0007', unit: 850, visitno: '69090101' },

  // CPM
  { date: '2026-05-10', drugcode: '0008', unit: 300, visitno: '69050030' },
  { date: '2026-07-14', drugcode: '0008', unit: 400, visitno: '69070068' },
  { date: '2026-09-05', drugcode: '0008', unit: 350, visitno: '69090022' },

  // Ventolin Inhaler
  { date: '2026-08-15', drugcode: '0009', unit: 6, visitno: '69080081' },
  { date: '2026-09-10', drugcode: '0009', unit: 8, visitno: '69090041' },

  // ORS
  { date: '2026-05-20', drugcode: '0010', unit: 100, visitno: '69050070' },
  { date: '2026-08-02', drugcode: '0010', unit: 120, visitno: '69080010' }

  // Notice: 0011 (Erythromycin Dry Syrup) has 0 dispensing! => Dead stock / Slow moving!
];

// Initial stock balances brought forward as of 2026-01-01
const mockBroughtForward = {
  '0001': 1500, // Paracetamol
  '0002': 800,  // Amoxicillin
  '0003': 2000, // Amlodipine
  '0004': 2500, // Metformin
  '0005': 500,  // Omeprazole
  '0006': 1200, // Losartan
  '0007': 1000, // Simvastatin
  '0008': 800,  // CPM
  '0009': 10,   // Ventolin
  '0010': 200,  // ORS
  '0011': 60    // Erythromycin (slow moving)
};

// JHCIS users
const mockUsers = [
  { username: 'admin', passwordHash: '21232f297a57a5a743894a0e4a801fc3', officername: 'เภสัชกรประจำ รพ.สต.', role: 'Admin' }, // md5('admin')
  { username: 'pharmacy', passwordHash: 'e10adc3949ba59abbe56e057f20f883e', officername: 'เจ้าหน้าที่งานเภสัชกรรม รพ.สต.', role: 'Pharmacist' }, // md5('123456')
  { username: 'nurse', passwordHash: 'e10adc3949ba59abbe56e057f20f883e', officername: 'พยาบาลวิชาชีพชำนาญการ', role: 'Staff' }
];

module.exports = {
  mockDrugs,
  mockReceipts,
  mockDispensing,
  mockBroughtForward,
  mockUsers
};
