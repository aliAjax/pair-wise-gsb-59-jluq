import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { ReviewActions } from "../../core/state/review.actions";
import {
  selectAuditLogs,
  selectRole,
  selectVersions,
} from "../../core/state/review.selectors";
import { roleProfiles } from "../../core/models/review.models";

@Component({
  selector: "app-audit-page",
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
  ],
  templateUrl: "./audit.page.html",
  styleUrl: "./audit.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditPage {
  private readonly store = inject(Store);

  readonly roleProfiles = roleProfiles;
  readonly logs = toSignal(this.store.select(selectAuditLogs), {
    initialValue: [],
  });
  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly keyword = signal("");
  readonly action = signal("all");
  readonly actionOptions = computed(() => [
    { label: "全部动作", value: "all" },
    ...Array.from(new Set(this.logs().map((log) => log.action))).map(
      (item) => ({ label: item, value: item }),
    ),
  ]);
  readonly filteredLogs = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    const action = this.action();
    return this.logs().filter((log) => {
      const matchesAction = action === "all" || log.action === action;
      const matchesKeyword =
        !keyword ||
        [log.actor, log.action, log.entity, log.detail]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      return matchesAction && matchesKeyword;
    });
  });
  readonly finalVersion = computed(
    () => this.versions().find((version) => version.status === "finalized"),
  );
  readonly finalizedCount = computed(
    () => this.versions().filter((version) => version.status === "finalized").length,
  );

  exportJson(): void {
    this.download(
      "procurement-review-audit.json",
      JSON.stringify(this.filteredLogs(), null, 2),
      "application/json;charset=utf-8",
    );
  }

  exportCsv(): void {
    const header = ["时间", "操作人", "动作", "对象", "详情"];
    const rows = this.filteredLogs().map((log) => [
      log.at,
      log.actor,
      log.action,
      log.entity,
      log.detail,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    this.download(
      "procurement-review-audit.csv",
      csv,
      "text/csv;charset=utf-8",
    );
  }

  resetReviewData(): void {
    this.store.dispatch(ReviewActions.resetReviewData());
  }

  private download(filename: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
