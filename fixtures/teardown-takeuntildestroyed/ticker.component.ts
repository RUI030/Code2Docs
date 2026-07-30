import { Component, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({ selector: 'x-ticker', template: '' })
export class TickerComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  ticks = 0;

  ngOnInit(): void {
    interval(1000)
      .pipe(map((n) => n * 2), takeUntilDestroyed(this.destroyRef))
      .subscribe((n) => (this.ticks = n));
  }
}
