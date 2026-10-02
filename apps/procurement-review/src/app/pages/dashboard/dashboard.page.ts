import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import {
  type Clause,
  type Clarification,
  type SupplierResponse,
} from "../../core/models/review.models";
import {
  effectiveReviews,
  hasDualReviewerConclusions,
  hasReviewDifference,
  selectAuditLogs,
  selectClauses,
  selectDashboard,
  selectError,
  selectLoading,
  selectPendingClarifications,
  selectRole,
  selectVersions,
} from "../../core/state/review.selectors";
import {
  ClarificationTagComponent,
  StatusTagComponent,
} from "../../shared/status-tag.component";

interface PendingIssue {
  clause: Clause;
  response: SupplierResponse;
  clarification: Clarification;
}

@Component({
  selector: "app-dashboard-page",
  imports: [
    RouterLink,
    DatePipe,
    ButtonModule,
    ProgressBarModule,
    TableModule,
    TagModule,
    StatusTagComponent,
    ClarificationTagComponent,
  ],
  templateUrl: "./dashboard.page.html",
  styleUrl: "./dashboard.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private readonly store = inject(Store);

  readonly dashboard = toSignal(this.store.select(selectDashboard), {
    initialValue: undefined,
  });
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly auditLogs = toSignal(this.store.select(selectAuditLogs), {
    initialValue: [],
  });
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly loading = toSignal(this.store.select(selectLoading), {
    initialValue: true,
  });
  readonly error = toSignal(this.store.select(selectError), {
    initialValue: undefined,
  });
  readonly pendingClarifications = toSignal(
    this.store.select(selectPendingClarifications),
    { initialValue: [] as PendingIssue[] },
  );
  readonly differences = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter((response) => hasReviewDifference(response, clause))
        .map((response) => ({ clause, response })),
    ),
  );
  readonly mandatoryGaps = computed(() =>
    this.clauses()
      .filter((clause) => clause.type === "mandatory")
      .flatMap((clause) =>
        clause.responses
          .filter((response) => !hasDualReviewerConclusions(response))
          .map((response) => ({ clause, response })),
      ),
  );
  readonly completion = computed(() => {
    const clauses = this.clauses();
    if (clauses.length === 0) {
      return 0;
    }
    // 现行批次两名评审员都留痕才算该条款完成独立评审。
    const reviewed = clauses.filter((clause) =>
      clause.responses.every(
        (response) => effectiveReviews(response).length >= 2,
      ),
    ).length;
    return Math.round((reviewed / clauses.length) * 100);
  });

  activeReviews(response: SupplierResponse) {
    return effectiveReviews(response);
  }
}
