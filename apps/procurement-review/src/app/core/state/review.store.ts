import { provideEffects } from "@ngrx/effects";
import { provideStore } from "@ngrx/store";
import { provideStoreDevtools } from "@ngrx/store-devtools";
import { ReviewEffects } from "./review.effects";
import { reviewReducer } from "./review.reducer";

export const provideReviewStore = [
  provideStore({ review: reviewReducer }),
  provideEffects(ReviewEffects),
  provideStoreDevtools({
    maxAge: 25,
    logOnly: true,
    name: "公共采购技术响应符合性评审",
  }),
];
