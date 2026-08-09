import type { PortfolioSeed } from "../../huiye-app";
import { portfolioEntries, portfolioThoughtLines } from "./demo-entries";
import {
  portfolioCaseRecords,
  portfolioEchoRecords,
  portfolioEchoReplies,
} from "./demo-evaluation";

// Static, user-approved MinimumRedaction data. Never import from the private
// runtime: PortfolioMode must remain independently deployable.
export const portfolioSeed: PortfolioSeed = {
  data: {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-08-09T00:00:00.000Z",
    entries: portfolioEntries,
    echoes: [],
    echoCheckedIds: [],
    thoughtLines: portfolioThoughtLines,
    caseRecords: portfolioCaseRecords,
    echoReplies: portfolioEchoReplies,
  },
  echoRecords: portfolioEchoRecords,
};
