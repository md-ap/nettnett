import Image from "next/image";
import AuthForm from "@/components/AuthForm";

export default function AuthPage() {
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
      </div>
    </div>
  );
}
