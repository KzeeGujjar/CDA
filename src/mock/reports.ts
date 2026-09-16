import type {
  AiPerformanceReport,
  InventoryReport,
  LeadReport,
  MarketReport,
  ProfitReport,
  PurchaseReport,
  SalesReport,
  SalespersonPerformanceReport,
  VehiclePerformanceReport,
} from "@/types/report";

export const salesReportFixture: SalesReport = {
  totalRevenue: 6_985_000,
  totalRevenueDelta: 14.2,
  unitsSold: 18,
  unitsSoldDelta: 20.0,
  avgSalePrice: 388_056,
  avgSalePriceDelta: 4.8,
  avgDaysToSell: 27,
  avgDaysToSellDelta: -8.1,
  trend: [
    { label: "Apr", value: 1_240_000 },
    { label: "May", value: 1_410_000 },
    { label: "Jun", value: 1_180_000 },
    { label: "Jul", value: 1_620_000 },
    { label: "Aug", value: 1_790_000 },
    { label: "Sep", value: 1_985_000 },
  ],
  byMake: [
    { label: "Toyota", value: 385_000 },
    { label: "Mercedes-Benz", value: 895_000 },
    { label: "Range Rover", value: 520_000 },
    { label: "BMW", value: 445_000 },
    { label: "Porsche", value: 610_000 },
    { label: "Tesla", value: 425_000 },
  ],
  rows: [
    { id: "sale-001", date: "2026-09-12", reference: "DL-2026-118", vehicleLabel: "2026 Porsche Cayenne Turbo GT", customerName: "Omar Al Falasi", salespersonName: "Layla Hassan", salePrice: 610_000 },
    { id: "sale-002", date: "2026-09-09", reference: "DL-2026-115", vehicleLabel: "2025 Mercedes-Benz G63 AMG", customerName: "Khalid Al Nuaimi", salespersonName: "Yousef Karim", salePrice: 895_000 },
    { id: "sale-003", date: "2026-09-05", reference: "DL-2026-111", vehicleLabel: "2024 Range Rover Autobiography", customerName: "Mariam Al Zaabi", salespersonName: "Noora Al Hammadi", salePrice: 520_000 },
    { id: "sale-004", date: "2026-08-28", reference: "DL-2026-104", vehicleLabel: "2024 BMW X7 M60i", customerName: "Elena Petrova", salespersonName: "Michael Chen", salePrice: 445_000 },
    { id: "sale-005", date: "2026-08-21", reference: "DL-2026-098", vehicleLabel: "2026 Tesla Model X Plaid", customerName: "James Carter", salespersonName: "Layla Hassan", salePrice: 425_000 },
    { id: "sale-006", date: "2026-08-14", reference: "DL-2026-091", vehicleLabel: "2024 Toyota Land Cruiser GXR V6", customerName: "Rajesh Kumar", salespersonName: "Yousef Karim", salePrice: 285_000 },
    { id: "sale-007", date: "2026-08-06", reference: "DL-2026-084", vehicleLabel: "2025 Toyota Land Cruiser VXR", customerName: "Aisha Al Mheiri", salespersonName: "Noora Al Hammadi", salePrice: 310_000 },
    { id: "sale-008", date: "2026-07-30", reference: "DL-2026-077", vehicleLabel: "2023 Porsche 911 Carrera S", customerName: "Ahmed Al Mazrouei", salespersonName: "Michael Chen", salePrice: 555_000 },
  ],
};

export const purchaseReportFixture: PurchaseReport = {
  totalSpend: 4_212_000,
  totalSpendDelta: 9.6,
  unitsPurchased: 12,
  unitsPurchasedDelta: 20.0,
  avgCostPerUnit: 351_000,
  avgCostPerUnitDelta: -3.2,
  trend: [
    { label: "Apr", value: 620_000 },
    { label: "May", value: 705_000 },
    { label: "Jun", value: 540_000 },
    { label: "Jul", value: 810_000 },
    { label: "Aug", value: 690_000 },
    { label: "Sep", value: 847_000 },
  ],
  bySource: [
    { label: "Trade-in", value: 5 },
    { label: "Auction", value: 3 },
    { label: "Direct import", value: 2 },
    { label: "Fleet buyback", value: 2 },
  ],
  rows: [
    { id: "pur-001", date: "2026-09-10", vehicleLabel: "2026 Range Rover Sport SV", supplierName: "Gulf Auto Auctions", purchasePrice: 498_000, transportCost: 4_200, totalCost: 502_200 },
    { id: "pur-002", date: "2026-09-03", vehicleLabel: "2025 BMW X5 M Competition", supplierName: "Trade-in — Khalid Al Nuaimi", purchasePrice: 362_000, transportCost: 0, totalCost: 362_000 },
    { id: "pur-003", date: "2026-08-25", vehicleLabel: "2024 Mercedes-Benz S580", supplierName: "Emirates Fleet Buyback", purchasePrice: 410_000, transportCost: 2_800, totalCost: 412_800 },
    { id: "pur-004", date: "2026-08-17", vehicleLabel: "2026 Porsche Macan Electric", supplierName: "Direct Import — Germany", purchasePrice: 355_000, transportCost: 18_500, totalCost: 373_500 },
    { id: "pur-005", date: "2026-08-09", vehicleLabel: "2023 Toyota Land Cruiser GR Sport", supplierName: "Trade-in — Fatima Al Suwaidi", purchasePrice: 268_000, transportCost: 0, totalCost: 268_000 },
    { id: "pur-006", date: "2026-08-02", vehicleLabel: "2025 Tesla Model S Plaid", supplierName: "Gulf Auto Auctions", purchasePrice: 398_000, transportCost: 3_100, totalCost: 401_100 },
  ],
};

export const profitReportFixture: ProfitReport = {
  grossProfit: 617_300,
  grossProfitDelta: 6.2,
  netMarginPct: 8.8,
  netMarginPctDelta: 1.1,
  avgProfitPerUnit: 34_294,
  avgProfitPerUnitDelta: 2.4,
  trend: [
    { label: "Apr", value: 96_000 },
    { label: "May", value: 108_000 },
    { label: "Jun", value: 88_000 },
    { label: "Jul", value: 124_000 },
    { label: "Aug", value: 141_000 },
    { label: "Sep", value: 160_300 },
  ],
  byMake: [
    { label: "Toyota", value: 41_000 },
    { label: "Mercedes-Benz", value: 96_000 },
    { label: "Range Rover", value: 58_000 },
    { label: "BMW", value: 47_000 },
    { label: "Porsche", value: 72_000 },
    { label: "Tesla", value: 39_000 },
  ],
  rows: [
    { id: "prof-001", vehicleLabel: "2026 Porsche Cayenne Turbo GT", costPrice: 538_000, sellingPrice: 610_000, grossProfit: 72_000, marginPct: 11.8 },
    { id: "prof-002", vehicleLabel: "2025 Mercedes-Benz G63 AMG", costPrice: 799_000, sellingPrice: 895_000, grossProfit: 96_000, marginPct: 10.7 },
    { id: "prof-003", vehicleLabel: "2024 Range Rover Autobiography", costPrice: 462_000, sellingPrice: 520_000, grossProfit: 58_000, marginPct: 11.2 },
    { id: "prof-004", vehicleLabel: "2024 BMW X7 M60i", costPrice: 398_000, sellingPrice: 445_000, grossProfit: 47_000, marginPct: 10.6 },
    { id: "prof-005", vehicleLabel: "2026 Tesla Model X Plaid", costPrice: 386_000, sellingPrice: 425_000, grossProfit: 39_000, marginPct: 9.2 },
    { id: "prof-006", vehicleLabel: "2024 Toyota Land Cruiser GXR V6", costPrice: 248_000, sellingPrice: 285_000, grossProfit: 37_000, marginPct: 13.0 },
  ],
};

export const inventoryReportFixture: InventoryReport = {
  totalUnits: 20,
  totalValue: 6_441_000,
  avgDaysInStock: 31,
  agingBuckets: [
    { label: "0-14 days", value: 6 },
    { label: "15-30 days", value: 7 },
    { label: "31-60 days", value: 4 },
    { label: "60+ days", value: 3 },
  ],
  byStatus: [
    { label: "Available", value: 14 },
    { label: "Reserved", value: 2 },
    { label: "In transit", value: 2 },
    { label: "Under inspection", value: 1 },
    { label: "Under repair", value: 1 },
  ],
  rows: [
    { id: "inv-001", vehicleLabel: "2024 Toyota Land Cruiser GXR V6", status: "Available", daysInStock: 12, costPrice: 248_000, currentPrice: 285_000, location: "Abu Dhabi Showroom" },
    { id: "inv-002", vehicleLabel: "2025 Range Rover Sport SV", status: "In transit", daysInStock: 5, costPrice: 498_000, currentPrice: 565_000, location: "En route — Jebel Ali Port" },
    { id: "inv-003", vehicleLabel: "2025 BMW X5 M Competition", status: "Available", daysInStock: 38, costPrice: 362_000, currentPrice: 409_000, location: "Dubai Yard" },
    { id: "inv-004", vehicleLabel: "2024 Mercedes-Benz S580", status: "Under inspection", daysInStock: 9, costPrice: 410_000, currentPrice: 465_000, location: "Abu Dhabi Workshop" },
    { id: "inv-005", vehicleLabel: "2026 Porsche Macan Electric", status: "Reserved", daysInStock: 21, costPrice: 355_000, currentPrice: 399_000, location: "Dubai Showroom" },
    { id: "inv-006", vehicleLabel: "2023 Toyota Land Cruiser GR Sport", status: "Available", daysInStock: 64, costPrice: 268_000, currentPrice: 299_000, location: "Sharjah Yard" },
    { id: "inv-007", vehicleLabel: "2025 Tesla Model S Plaid", status: "Under repair", daysInStock: 17, costPrice: 398_000, currentPrice: 442_000, location: "Abu Dhabi Workshop" },
  ],
};

export const leadReportFixture: LeadReport = {
  totalLeads: 62,
  totalLeadsDelta: 11.4,
  conversionRate: 24.5,
  conversionRateDelta: 2.1,
  avgResponseHours: 1.8,
  bySource: [
    { label: "Website", value: 22 },
    { label: "Walk-in", value: 9 },
    { label: "Referral", value: 8 },
    { label: "Social media", value: 14 },
    { label: "Marketplace", value: 6 },
    { label: "Phone", value: 3 },
  ],
  funnel: [
    { label: "New", value: 38 },
    { label: "Contacted", value: 27 },
    { label: "Qualified", value: 19 },
    { label: "Negotiation", value: 11 },
    { label: "Won", value: 8 },
  ],
  rows: [
    { id: "lr-001", customerName: "Omar Al Falasi", source: "Referral", stage: "Won", assignedToName: "Layla Hassan", score: 92, createdAt: "2026-08-18" },
    { id: "lr-002", customerName: "Priya Nair", source: "Website", stage: "Negotiation", assignedToName: "Yousef Karim", score: 81, createdAt: "2026-09-01" },
    { id: "lr-003", customerName: "James Carter", source: "Social media", stage: "Qualified", assignedToName: "Noora Al Hammadi", score: 74, createdAt: "2026-09-04" },
    { id: "lr-004", customerName: "Zainab Sheikh", source: "Marketplace", stage: "Contacted", assignedToName: "Michael Chen", score: 58, createdAt: "2026-09-08" },
    { id: "lr-005", customerName: "Arjun Mehta", source: "Walk-in", stage: "New", assignedToName: "Layla Hassan", score: 45, createdAt: "2026-09-12" },
    { id: "lr-006", customerName: "Hassan Raza", source: "Website", stage: "Qualified", assignedToName: "Yousef Karim", score: 69, createdAt: "2026-09-06" },
  ],
};

export const salespersonPerformanceReportFixture: SalespersonPerformanceReport = {
  rows: [
    { id: "sp-001", name: "Layla Hassan", leadsAssigned: 19, dealsWon: 9, conversionRate: 47.4, revenue: 1_240_000, avgResponseHours: 1.1 },
    { id: "sp-002", name: "Yousef Karim", leadsAssigned: 16, dealsWon: 7, conversionRate: 43.8, revenue: 980_000, avgResponseHours: 1.6 },
    { id: "sp-003", name: "Noora Al Hammadi", leadsAssigned: 15, dealsWon: 6, conversionRate: 40.0, revenue: 810_000, avgResponseHours: 2.0 },
    { id: "sp-004", name: "Michael Chen", leadsAssigned: 12, dealsWon: 5, conversionRate: 41.7, revenue: 640_000, avgResponseHours: 2.4 },
  ],
  revenueByRep: [
    { label: "Layla Hassan", value: 1_240_000 },
    { label: "Yousef Karim", value: 980_000 },
    { label: "Noora Al Hammadi", value: 810_000 },
    { label: "Michael Chen", value: 640_000 },
  ],
  dealsByRep: [
    { label: "Layla Hassan", value: 9 },
    { label: "Yousef Karim", value: 7 },
    { label: "Noora Al Hammadi", value: 6 },
    { label: "Michael Chen", value: 5 },
  ],
};

export const vehiclePerformanceReportFixture: VehiclePerformanceReport = {
  rows: [
    { id: "vp-001", vehicleLabel: "Toyota Land Cruiser GXR V6", make: "Toyota", daysToSell: 12, views: 486, inquiries: 21, status: "Sold" },
    { id: "vp-002", vehicleLabel: "Mercedes-Benz G63 AMG", make: "Mercedes-Benz", daysToSell: 9, views: 612, inquiries: 34, status: "Sold" },
    { id: "vp-003", vehicleLabel: "Range Rover Autobiography", make: "Range Rover", daysToSell: 18, views: 398, inquiries: 17, status: "Sold" },
    { id: "vp-004", vehicleLabel: "BMW X5 M Competition", make: "BMW", daysToSell: null, views: 275, inquiries: 9, status: "Available" },
    { id: "vp-005", vehicleLabel: "Porsche 911 Carrera S", make: "Porsche", daysToSell: 22, views: 540, inquiries: 28, status: "Sold" },
    { id: "vp-006", vehicleLabel: "Toyota Land Cruiser GR Sport", make: "Toyota", daysToSell: null, views: 164, inquiries: 5, status: "Available" },
    { id: "vp-007", vehicleLabel: "Tesla Model S Plaid", make: "Tesla", daysToSell: null, views: 231, inquiries: 8, status: "Under repair" },
  ],
  topSellingModels: [
    { label: "Land Cruiser", value: 5 },
    { label: "G63 AMG", value: 3 },
    { label: "Autobiography", value: 3 },
    { label: "911 Carrera", value: 2 },
    { label: "Model X", value: 2 },
  ],
  slowestMoving: [
    { label: "Land Cruiser GR Sport", value: 64 },
    { label: "X5 M Competition", value: 38 },
    { label: "Model S Plaid", value: 17 },
    { label: "Macan Electric", value: 21 },
  ],
};

export const marketReportFixture: MarketReport = {
  rows: [
    { id: "mk-001", make: "Toyota", model: "Land Cruiser", avgMarketPrice: 292_000, yourAvgPrice: 285_000, demandIndex: 88, trendPct: 4.8 },
    { id: "mk-002", make: "Mercedes-Benz", model: "G63 AMG", avgMarketPrice: 910_000, yourAvgPrice: 895_000, demandIndex: 81, trendPct: 3.1 },
    { id: "mk-003", make: "Range Rover", model: "Autobiography", avgMarketPrice: 535_000, yourAvgPrice: 520_000, demandIndex: 74, trendPct: 2.4 },
    { id: "mk-004", make: "BMW", model: "X7 M60i", avgMarketPrice: 452_000, yourAvgPrice: 445_000, demandIndex: 63, trendPct: 1.2 },
    { id: "mk-005", make: "Porsche", model: "Cayenne Turbo GT", avgMarketPrice: 615_000, yourAvgPrice: 610_000, demandIndex: 79, trendPct: 3.6 },
    { id: "mk-006", make: "Tesla", model: "Model X Plaid", avgMarketPrice: 418_000, yourAvgPrice: 425_000, demandIndex: 58, trendPct: -1.4 },
  ],
  demandByCategory: [
    { label: "Full-size SUV", value: 86 },
    { label: "Luxury sedan", value: 62 },
    { label: "Sports coupe", value: 71 },
    { label: "Electric", value: 55 },
    { label: "Pickup", value: 48 },
  ],
  priceTrend: [
    { label: "Apr", value: 100 },
    { label: "May", value: 102 },
    { label: "Jun", value: 101 },
    { label: "Jul", value: 104 },
    { label: "Aug", value: 106 },
    { label: "Sep", value: 108 },
  ],
};

export const aiPerformanceReportFixture: AiPerformanceReport = {
  totalInteractions: 1_842,
  totalInteractionsDelta: 27.6,
  avgSatisfaction: 91.4,
  timeSavedHours: 146,
  usageTrend: [
    { label: "Apr", value: 210 },
    { label: "May", value: 265 },
    { label: "Jun", value: 248 },
    { label: "Jul", value: 312 },
    { label: "Aug", value: 368 },
    { label: "Sep", value: 439 },
  ],
  rows: [
    { id: "ai-001", feature: "AI Car Agent", interactions: 612, successRate: 94.2, avgResponseSeconds: 2.1, timeSavedHours: 58 },
    { id: "ai-002", feature: "AI Marketing", interactions: 348, successRate: 89.7, avgResponseSeconds: 3.4, timeSavedHours: 34 },
    { id: "ai-003", feature: "AI Document Assistant", interactions: 284, successRate: 92.6, avgResponseSeconds: 2.8, timeSavedHours: 26 },
    { id: "ai-004", feature: "AI Lead Scoring", interactions: 401, successRate: 90.1, avgResponseSeconds: 0.9, timeSavedHours: 18 },
    { id: "ai-005", feature: "Price Analyzer", interactions: 197, successRate: 87.3, avgResponseSeconds: 1.7, timeSavedHours: 10 },
  ],
};
