import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({ selector: 'x-widget', template: '' })
export class WidgetComponent {
  @Input() label = 'untitled';
  @Input({ required: true }) count!: number;
  @Input('aliasedName') internalName?: string;
  @Output() changed = new EventEmitter<number>();

  bump(): void {
    this.changed.emit(this.count + 1);
  }
}
