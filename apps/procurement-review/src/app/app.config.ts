import {
  provideHttpClient,
  withFetch,
} from "@angular/common/http";
import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from "@angular/core";
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from "@angular/router";
import { provideApollo } from "apollo-angular";
import { InMemoryCache } from "@apollo/client/core";
import { HttpLink } from "@apollo/client/core";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeuix/themes/aura";
import { MessageService } from "primeng/api";
import { appRoutes } from "./app.routes";
import { provideReviewStore } from "./core/state/review.store";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        anchorScrolling: "enabled",
        scrollPositionRestoration: "enabled",
      }),
    ),
    provideHttpClient(withFetch()),
    provideApollo(() => ({
      link: new HttpLink({
        uri: "http://127.0.0.1:18462/graphql",
      }),
      cache: new InMemoryCache(),
    })),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
          cssLayer: false,
        },
      },
    }),
    MessageService,
    provideReviewStore,
  ],
};
