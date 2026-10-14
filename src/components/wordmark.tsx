import Link from "next/link";

export function Wordmark({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-ink">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-md bg-pine font-serif text-sm text-white"
      >
        R
      </span>
      <span className="font-serif text-xl leading-none tracking-tight">
        SmartRentBoss
      </span>
    </Link>
  );
}
