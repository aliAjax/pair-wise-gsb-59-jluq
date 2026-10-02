import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
} from "@angular/core";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { Store } from "@ngrx/store";
import { toSignal } from "@angular/core/rxjs-interop";
import { MessageService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { ProgressBarModule } from "primeng/progressbar";
import { SelectModule } from "primeng/select";
import { ToastModule } from "primeng/toast";
import {
  roleProfiles,
  type ReviewRole,
} from "./core/models/review.models";
import { ReviewActions } from "./core/state/review.actions";
import {
  selectError,
  selectLoading,
  selectRole,
  selectSaving,
  selectToast,
} from "./core/state/review.selectors";

@Component({
  selector: "app-root",
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ButtonModule,
    ProgressBarModule,
    SelectModule,
    ToastModule,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly messages = inject(MessageService);
  private lastToast = "";
  private lastError = "";

  readonly roleControl = new FormControl<ReviewRole>(
    (localStorage.getItem("procurement-review-role") as ReviewRole | null) ??
      "reviewer_a",
    { nonNullable: true },
  );
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: this.roleControl.value,
  });
  readonly loading = toSignal(this.store.select(selectLoading), {
    initialValue: false,
  });
  readonly saving = toSignal(this.store.select(selectSaving), {
    initialValue: false,
  });
  readonly toast = toSignal(this.store.select(selectToast), {
    initialValue: undefined,
  });
  readonly error = toSignal(this.store.select(selectError), {
    initialValue: undefined,
  });
  readonly roleOptions = Object.entries(roleProfiles).map(([value, profile]) => ({
    value: value as ReviewRole,
    label: `${profile.label} · ${profile.name}`,
  }));
  readonly currentProfile = () => roleProfiles[this.role()];

  ngOnInit(): void {
    this.store.dispatch(
      ReviewActions.setRole({ role: this.roleControl.value }),
    );
    this.store.dispatch(ReviewActions.loadReviewData());
    this.roleControl.valueChanges.subscribe((role) => {
      localStorage.setItem("procurement-review-role", role);
      this.store.dispatch(ReviewActions.setRole({ role }));
    });
  }

  changeRole(role: ReviewRole): void {
    this.roleControl.setValue(role);
  }

  clearMessages(): void {
    this.store.dispatch(ReviewActions.clearToast());
  }

  notify(message: string | undefined, key: string): void {
    if (!message || this.lastToast === key) {
      return;
    }
    this.lastToast = key;
    this.messages.add({
      severity: "success",
      summary: "操作完成",
      detail: message,
      life: 3000,
    });
    setTimeout(() => this.clearMessages(), 3200);
  }

  notifyError(message: string | undefined, key: string): void {
    if (!message || this.lastError === key) {
      return;
    }
    this.lastError = key;
    this.messages.add({
      severity: "error",
      summary: "操作未完成",
      detail: message,
      life: 6000,
    });
  }

  constructor() {
    effect(() => {
      this.notify(this.toast(), this.toast() ?? "");
      this.notifyError(this.error(), this.error() ?? "");
    });
  }
}
