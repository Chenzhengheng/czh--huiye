import PortfolioPage, { metadata } from "./portfolio/page";
import { getPublicRequestContext } from "./public-deployment";

export { metadata };

export default async function PublicHomePage() {
  const { isMainland } = await getPublicRequestContext();
  return <PortfolioPage enableVisitBeacon={!isMainland} />;
}
