import Image from "next/image";
import AuthForm from "@/components/AuthForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo_nettnett.jpg"
            alt="NettNett"
            width={180}
            height={60}
            priority
          />
        </div>
        <AuthForm />
        <p className="mt-6 text-center text-sm text-white/40">
          <Link href="/" className="hover:text-white/60 transition-colors">
            ← Back to Radio
          </Link>
        </p>
      </div>
    </div>
  );
}
