import type { PermissionMatrix } from "@/lib/settings-roles";

export const rolePermissionsFixture: PermissionMatrix = {
  inventory: { superAdmin: true, dealerOwner: true, manager: true, salesperson: true, buyer: true, accountant: false, marketingManager: false, viewer: true },
  purchasing: { superAdmin: true, dealerOwner: true, manager: true, salesperson: false, buyer: true, accountant: false, marketingManager: false, viewer: false },
  leads: { superAdmin: true, dealerOwner: true, manager: true, salesperson: true, buyer: false, accountant: false, marketingManager: false, viewer: false },
  deals: { superAdmin: true, dealerOwner: true, manager: true, salesperson: true, buyer: false, accountant: true, marketingManager: false, viewer: false },
  documents: { superAdmin: true, dealerOwner: true, manager: true, salesperson: true, buyer: true, accountant: true, marketingManager: false, viewer: false },
  billing: { superAdmin: true, dealerOwner: true, manager: false, salesperson: false, buyer: false, accountant: true, marketingManager: false, viewer: false },
  marketing: { superAdmin: true, dealerOwner: true, manager: true, salesperson: false, buyer: false, accountant: false, marketingManager: true, viewer: false },
  reports: { superAdmin: true, dealerOwner: true, manager: true, salesperson: false, buyer: false, accountant: true, marketingManager: true, viewer: true },
  settings: { superAdmin: true, dealerOwner: true, manager: false, salesperson: false, buyer: false, accountant: false, marketingManager: false, viewer: false },
  aiActivity: { superAdmin: true, dealerOwner: true, manager: true, salesperson: false, buyer: false, accountant: false, marketingManager: true, viewer: false },
};
