import type { ID } from "@/types/common";
import type { DealershipUser, DealershipUserInput } from "@/types/settings";
import { dealershipUsersFixture } from "@/mock/dealership-users";

let users: DealershipUser[] = [...dealershipUsersFixture];

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDealershipUsers(): Promise<DealershipUser[]> {
  await wait();
  return users;
}

export async function inviteDealershipUser(input: DealershipUserInput): Promise<DealershipUser> {
  await wait(300);
  const created: DealershipUser = {
    id: `u-${Math.random().toString(36).slice(2, 9)}`,
    ...input,
    status: "invited",
  };
  users = [...users, created];
  return created;
}

export async function removeDealershipUser(id: ID): Promise<void> {
  await wait(150);
  users = users.filter((u) => u.id !== id);
}
