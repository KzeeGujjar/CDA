import {
  Banknote,
  Bell,
  Building2,
  CreditCard,
  FileStack,
  Globe,
  KeyRound,
  Megaphone,
  Moon,
  Percent,
  Plug,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SettingsSectionKey =
  | "profile"
  | "dealership"
  | "users"
  | "rolesPermissions"
  | "notifications"
  | "aiSettings"
  | "integrations"
  | "language"
  | "appearance"
  | "currency"
  | "tax"
  | "documentTemplates"
  | "marketplaceConnections"
  | "security"
  | "billing"
  | "apiKeys"
  | "dashboardAds"
  | "demoData";

export const settingsSections: { key: SettingsSectionKey; icon: LucideIcon }[] = [
  { key: "profile", icon: User },
  { key: "dealership", icon: Building2 },
  { key: "users", icon: Users },
  { key: "rolesPermissions", icon: ShieldCheck },
  { key: "notifications", icon: Bell },
  { key: "aiSettings", icon: Sparkles },
  { key: "integrations", icon: Plug },
  { key: "language", icon: Globe },
  { key: "appearance", icon: Moon },
  { key: "currency", icon: Banknote },
  { key: "tax", icon: Percent },
  { key: "documentTemplates", icon: FileStack },
  { key: "marketplaceConnections", icon: Store },
  { key: "security", icon: Shield },
  { key: "billing", icon: CreditCard },
  { key: "apiKeys", icon: KeyRound },
  { key: "dashboardAds", icon: Megaphone },
  { key: "demoData", icon: RotateCcw },
];
