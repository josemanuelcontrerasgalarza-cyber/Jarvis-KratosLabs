import Jarvis from "@/components/Jarvis";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Jarvis userName={process.env.JARVIS_USER_NAME || "señor"} />;
}
