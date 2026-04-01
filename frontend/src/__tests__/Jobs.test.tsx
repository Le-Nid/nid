import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import JobsPage from "../pages/Jobs";

const refetchMock = vi.fn();
const cancelMock = vi.fn();
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
  error: null,
};

const completedJob = {
  id: "job-2",
  type: "archive_mails",
  status: "completed",
  progress: 100,
  processed: 50,
  total: 50,
  created_at: "2026-03-30T10:00:00.000Z",
  completed_at: "2026-03-30T10:05:00.000Z",
  gmail_account_id: "account-1",
  error: null,
};

const failedJob = {
  id: "job-3",
  type: "run_rule",
  status: "failed",
  progress: 50,
  processed: 25,
  total: 50,
  created_at: "2026-03-30T10:00:00.000Z",
  completed_at: "2026-03-30T10:02:00.000Z",
  gmail_account_id: "account-1",
  error: "Quota exceeded",
};

const pendingJob = {
  id: "job-4",
  type: "sync_dashboard",
  status: "pending",
  progress: 0,
  processed: 0,
  total: 100,
  created_at: "2026-03-30T10:00:00.000Z",
  completed_at: null,
  gmail_account_id: "account-1",
  error: null,
};

const useJobsReturn = {
  data: [] as any[],
  isLoading: false,
  refetch: refetchMock,
};

vi.mock("../hooks/queries", () => ({
  useJobs: () => useJobsReturn,
  useCancelJob: () => ({ mutateAsync: cancelMock }),
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
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.defaultValue || key }),
}));

describe("JobsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refetchMock.mockReset();
    cancelMock.mockReset();
    cancelMock.mockResolvedValue({});
    useJobsReturn.data = [];
    useJobsReturn.isLoading = false;
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

  it("does not poll when no active jobs", () => {
    useJobsReturn.data = [completedJob];

    render(<JobsPage />);

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(refetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows title", () => {
    render(<JobsPage />);
    expect(screen.getByText("jobs.title")).toBeInTheDocument();
  });

  it("displays jobs with different statuses", () => {
    useJobsReturn.data = [activeJob, completedJob, failedJob, pendingJob];

    render(<JobsPage />);
    // Job types are passed as defaultValue (raw type string)
    expect(screen.getByText("bulk_operation")).toBeInTheDocument();
    expect(screen.getByText("archive_mails")).toBeInTheDocument();
    expect(screen.getByText("run_rule")).toBeInTheDocument();
    expect(screen.getByText("sync_dashboard")).toBeInTheDocument();
  });

  it("shows error tag for failed jobs", () => {
    useJobsReturn.data = [failedJob];

    render(<JobsPage />);
    expect(screen.getByText("Quota exceeded")).toBeInTheDocument();
  });

  it("shows duration for completed jobs", () => {
    useJobsReturn.data = [completedJob];

    render(<JobsPage />);
    expect(screen.getByText("300s")).toBeInTheDocument();
  });

  it("shows dash for duration when job not completed", () => {
    useJobsReturn.data = [activeJob];

    render(<JobsPage />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows filter status select", () => {
    render(<JobsPage />);
    expect(screen.getByText("jobs.filterStatus")).toBeInTheDocument();
  });

  it("shows empty state when no jobs", () => {
    useJobsReturn.data = [];

    render(<JobsPage />);
    expect(screen.getByText("jobs.title")).toBeInTheDocument();
  });
});