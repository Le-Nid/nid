import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import JobsPage from "../pages/Jobs";

const refetchMock = vi.fn();
const activeJob = {
  id: "job-1",
  type: "bulk_operation",
  status: "active",
  progress: 10,
  processed: 1,
  total: 10,
  created_at: "2026-03-30T10:00:00.000Z",
  completed_at: null,
  gmail_account_id: "account-1",
};

const useJobsReturn = {
  data: [] as any[],
  isLoading: false,
  refetch: refetchMock,
};

vi.mock("../hooks/queries", () => ({
  useJobs: () => useJobsReturn,
  useCancelJob: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../hooks/useAccount", () => ({
  useAccount: () => ({
    accountId: "account-1",
    account: null,
  }),
}));

vi.mock("../components/JobProgressModal", () => ({
  default: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("JobsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polling toutes les 5s uniquement quand des jobs sont actifs", () => {
    useJobsReturn.data = [activeJob];

    const { unmount } = render(<JobsPage />);

    // Pas encore de polling
    expect(refetchMock).toHaveBeenCalledTimes(0);

    // Après 5s → 1er refetch
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);

    // Après 10s → 2e refetch
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refetchMock).toHaveBeenCalledTimes(2);

    // Après 15s → 3e refetch
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refetchMock).toHaveBeenCalledTimes(3);

    unmount();
  });
});