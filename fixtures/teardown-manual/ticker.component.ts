import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({ selector: 'x-ticker', template: '' })
export class TickerComponent implements OnInit, OnDestroy {
  private sub = new Subscription();
  ticks = 0;

  ngOnInit(): void {
    this.sub.add(
      interval(1000)
        .pipe(map((n) => n * 2))
        .subscribe((n) => (this.ticks = n)),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
