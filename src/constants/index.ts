import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bot,
  Car,
  Warehouse,
  ShoppingCart,
  Tag,
  Users,
  Contact,
  Handshake,
  Globe,
  LineChart,
  Calculator,
  Gauge,
  Megaphone,
  FileText,
  ListChecks,
  MessageSquare,
  BarChart3,
  Settings,
  Activity,
} from "lucide-react";

export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  placeholder?: boolean;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: "overview",
    labelKey: "nav.groups.overview",
    items: [{ key: "dashboard", labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    key: "ai",
    labelKey: "nav.groups.ai",
    items: [{ key: "aiCarAgent", labelKey: "nav.aiCarAgent", href: "/ai-assistant", icon: Bot }],
  },
  {
    key: "vehiclesInventory",
    labelKey: "nav.groups.vehiclesInventory",
    items: [
      { key: "vehicles", labelKey: "nav.vehicles", href: "/vehicles", icon: Car, placeholder: true },
      { key: "inventory", labelKey: "nav.inventory", href: "/inventory", icon: Warehouse },
      { key: "buyVehicles", labelKey: "nav.buyVehicles", href: "/buy-vehicles", icon: ShoppingCart, placeholder: true },
      { key: "sellVehicles", labelKey: "nav.sellVehicles", href: "/sell-vehicles", icon: Tag, placeholder: true },
    ],
  },
  {
    key: "salesCrm",
    labelKey: "nav.groups.salesCrm",
    items: [
      { key: "leads", labelKey: "nav.leads", href: "/leads", icon: Users },
      { key: "customers", labelKey: "nav.customers", href: "/customers", icon: Contact },
      { key: "deals", labelKey: "nav.deals", href: "/deals", icon: Handshake },
    ],
  },
  {
    key: "marketIntelligence",
    labelKey: "nav.groups.marketIntelligence",
    items: [
      { key: "marketIntelligence", labelKey: "nav.marketIntelligence", href: "/market-intelligence", icon: Globe, placeholder: true },
      { key: "priceAnalyzer", labelKey: "nav.priceAnalyzer", href: "/price-analyzer", icon: LineChart, placeholder: true },
      { key: "profitCalculator", labelKey: "nav.profitCalculator", href: "/profit-calculator", icon: Calculator, placeholder: true },
      { key: "vehicleValuation", labelKey: "nav.vehicleValuation", href: "/valuation", icon: Gauge },
    ],
  },
  {
    key: "marketing",
    labelKey: "nav.groups.marketing",
    items: [{ key: "aiMarketing", labelKey: "nav.aiMarketing", href: "/ai-marketing", icon: Megaphone }],
  },
  {
    key: "operations",
    labelKey: "nav.groups.operations",
    items: [
      { key: "contractsDocuments", labelKey: "nav.contractsDocuments", href: "/contracts-documents", icon: FileText },
      { key: "tasks", labelKey: "nav.tasks", href: "/tasks", icon: ListChecks },
      { key: "messages", labelKey: "nav.messages", href: "/messages", icon: MessageSquare },
      { key: "reports", labelKey: "nav.reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    key: "system",
    labelKey: "nav.groups.system",
    items: [
      { key: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings },
      { key: "aiActivity", labelKey: "nav.aiActivity", href: "/ai-activity", icon: Activity },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

export const dealerships = [
  { id: "dxb-main", name: "Downtown Dubai Showroom" },
  { id: "dxb-auto-mall", name: "Sheikh Zayed Auto Mall" },
  { id: "auh-branch", name: "Emco Cars - Abu Dhabi" },
];
