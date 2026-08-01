import { Component } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';

/**
 * outputFromObservable: an output driven by a stream rather than emitted from
 * code. It is simultaneously a public-contract entry and a teardown concern --
 * the framework manages the subscription, which is precisely what a naive
 * rewrite reimplements by hand and then leaks.
 *
 * Before this, it matched none of eventemitter | output-fn | subject and was
 * recorded as no output at all (F10b).
 */
@Component({
  selector: 'x-ticker',
  template: '',
})
export class TickerComponent {
  private ticks$ = new Subject<number>();

  readonly tick = outputFromObservable(this.ticks$);
}
