import { signOut } from "@/auth";

import { secondaryButton } from "@/components/styles";

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button type="submit" className={secondaryButton}>
        Log out
      </button>
    </form>
  );
}
