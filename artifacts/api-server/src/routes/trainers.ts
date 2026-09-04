import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, staffTable, trainersTable } from "@workspace/db";
import {
  ListTrainersQueryParams,
  ListTrainersResponse,
  ListLiveTrainersQueryParams,
  ListLiveTrainersResponse,
  GetTrainerParams,
  GetTrainerResponse,
} from "@workspace/api-zod";
import { gymsTable } from "@workspace/db";
import { fetchYoactivTrainers, yoactivConfigured } from "../lib/yoactiv";
import { trainerPhotoMap } from "../lib/trainerPhotos";
import { microCache } from "../lib/microCache";

const router: IRouter = Router();

// 30s micro-cache: trainer rosters are public and identical for everyone.
const TRAINERS_TTL_MS = 30_000;

// NOTE: must be registered before /trainers/:trainerId so "live" isn't
// captured as a trainer id.
router.get("/trainers/live", microCache(TRAINERS_TTL_MS), async (req, res): Promise<void> => {
  if (!yoactivConfigured()) {
    res.json(ListLiveTrainersResponse.parse([]));
    return;
  }
  const parsed = ListLiveTrainersQueryParams.safeParse(req.query);
  if (!parsed.success || parsed.data.gymId === undefined) {
    // A mobile roster without a selected branch must never aggregate trainers
    // from every configured YoActiv branch.
    res.json(ListLiveTrainersResponse.parse([]));
    return;
  }
  let branchId: number;
  const selectedGymId = parsed.data.gymId;
  {
    const [gym] = await db
      .select({ yoactivBranchId: gymsTable.yoactivBranchId })
      .from(gymsTable)
      .where(eq(gymsTable.id, selectedGymId));
    // A gym without a branch mapping has no live roster — the app then shows
    // the local trainer profiles instead of another branch's coaches.
    if (!gym?.yoactivBranchId) {
      res.json(ListLiveTrainersResponse.parse([]));
      return;
    }
    branchId = gym.yoactivBranchId;
  }
  const trainers = await fetchYoactivTrainers(branchId);
  const activeStaff = await db
    .select({
      name: staffTable.name,
      yoactivStaffId: staffTable.yoactivStaffId,
    })
    .from(staffTable)
    .where(
      and(
        eq(staffTable.gymId, selectedGymId),
        eq(staffTable.isActive, true),
        sql`${staffTable.permissions} @> ARRAY['pt.manage']::text[]`,
      ),
    );
  const allowedIds = new Set(
    activeStaff.map((s) => s.yoactivStaffId).filter((id): id is string => !!id),
  );
  const visibleTrainers = trainers.filter((t) => allowedIds.has(t.id));
  const photos = await trainerPhotoMap(visibleTrainers.map((t) => t.id));
  res.json(
    ListLiveTrainersResponse.parse(
      visibleTrainers.map((t) => ({
        ...t,
        photoUrl: photos.get(t.id) ?? null,
      })),
    ),
  );
});

router.get("/trainers", microCache(TRAINERS_TTL_MS), async (req, res): Promise<void> => {
  const parsed = ListTrainersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let rows = await db.select().from(trainersTable);
  if (parsed.data.specialty)
    rows = rows.filter(
      (t) => t.specialty.toLowerCase() === parsed.data.specialty!.toLowerCase(),
    );
  res.json(ListTrainersResponse.parse(rows));
});

router.get("/trainers/:trainerId", async (req, res): Promise<void> => {
  const params = GetTrainerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [t] = await db
    .select()
    .from(trainersTable)
    .where(eq(trainersTable.id, params.data.trainerId));
  if (!t) {
    res.status(404).json({ error: "Trainer not found" });
    return;
  }
  res.json(GetTrainerResponse.parse(t));
});

export default router;
