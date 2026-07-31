import { Component } from '@angular/core';

@Component({ selector: 'x-list', templateUrl: './list.component.html' })
export class ListComponent {
  isReady = false;
  mode: 'edit' | 'view' = 'view';
  items: { id: number; name: string }[] = [];

  trackById(index: number, item: { id: number }): number {
    return item.id;
  }
}
