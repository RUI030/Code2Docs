import { Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FeedService } from './feed.service';

/**
 * A stream consumed only through the async pipe: no ngOnDestroy, no
 * takeUntilDestroyed, no manual unsubscribe. Angular ends the subscription when
 * the view is destroyed.
 *
 * Exists because F20 found this shape writing `async-pipe-only` -- a value from
 * signature.json's UNIT-level cleanupStrategy vocabulary -- into a per-stream
 * unsubscribeStrategy field governed by a different vocabulary that does not
 * contain it. The two enums overlap on three values, so 59 fixtures all happened
 * to produce something legal in both and the conflation was invisible.
 */
@Component({
  selector: 'x-feed',
  template: `
    @for (item of items$ | async; track item) {
      <li>{{ item }}</li>
    }
  `,
})
export class FeedComponent {
  private readonly feed = inject(FeedService);
  readonly items$: Observable<string[]> = this.feed.items();
}
