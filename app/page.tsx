import PoolHomeClient from "@/app/pool-home-client";
import { getPoolSnapshot } from "@/lib/pool";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialSnapshot = await getPoolSnapshot();
  return <PoolHomeClient initialSnapshot={initialSnapshot} />;
}
