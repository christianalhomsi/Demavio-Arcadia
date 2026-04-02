import type { Metadata } from "next";
import AuthForm from "./request-otp-form";

export const metadata: Metadata = {
  title: "Sign in | Gaming Hub",
};

export default function LoginPage() {
  return <AuthForm />;
}
