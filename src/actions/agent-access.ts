"use server";

import { revalidatePath } from "next/cache";

import {
  createAgentAccessToken,
  revokeAgentAccessToken,
  type AgentScopeName,
} from "@/lib/agent/tokens";
import { requireUser } from "@/lib/dal";
import { formString, type FieldErrors } from "@/lib/validators";

export type AgentTokenFormState = {
  message?: string;
  errors?: FieldErrors;
  token?: string;
  tokenName?: string;
};

export async function createAgentToken(
  _prev: AgentTokenFormState,
  formData: FormData,
): Promise<AgentTokenFormState> {
  const user = await requireUser();
  const name = formString(formData, "name").trim();
  const access = formString(formData, "access");
  const errors: FieldErrors = {};
  if (name.length < 2 || name.length > 60) {
    errors.name = ["Name the token in 2 to 60 characters."];
  }
  if (access !== "read" && access !== "write") {
    errors.access = ["Choose read, or read and write."];
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }
  const created = await createAgentAccessToken({
    ownerId: user.id,
    name,
    access: access as AgentScopeName,
  });
  revalidatePath("/dashboard/settings/agent");
  return { token: created.secret, tokenName: created.token.name };
}

export async function revokeAgentToken(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (id) {
    await revokeAgentAccessToken(user.id, id);
  }
  revalidatePath("/dashboard/settings/agent");
}
