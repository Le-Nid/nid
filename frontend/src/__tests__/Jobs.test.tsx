import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import JobsPage from "../pages/Jobs";

const jobsListMock = vi.fn();

vi.mock("../api", () => ({
  jobsApi: {
    list: (...args: unknown[]) => jobsListMock(...args),
    cancel: vi.fn(),
  },
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

describe("JobsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    jobsListMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'empile pas les appels de polling si un chargement est déjà en cours", async () => {
    jobsListMock.mockResolvedValueOnce([
      {
        id: "job-1",
        type: "bulk_operation",
        status: "active",
        progress: 10,
        processed: 1,
        total: 10,
        created_at: "2026-03-30T10:00:00.000Z",
        completed_at: null,
        gmail_account_id: "account-1",
      },
    ]);

    let resolveSecondRequest: ((value: any[]) => void) | null = null;
    jobsListMock.mockImplementationOnce(
      () =>
        new Promise<any[]>((resolve) => {
          resolveSecondRequest = resolve;
        }),
    );

    const { unmount } = render(<JobsPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(jobsListMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(jobsListMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    expect(jobsListMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondRequest?.([
        {
          id: "job-1",
          type: "bulk_operation",
          status: "completed",
          progress: 100,
          processed: 10,
          total: 10,
          created_at: "2026-03-30T10:00:00.000Z",
          completed_at: "2026-03-30T10:01:00.000Z",
          gmail_account_id: "account-1",
        },
      ]);
      await Promise.resolve();
    });

    unmount();
  });
});