import { Component, input, output, model } from '@angular/core';

@Component({ selector: 'x-widget', template: '' })
export class WidgetComponent {
  label = input('untitled');
  count = input.required<number>();
  internalName = input<string | undefined>(undefined, { alias: 'aliasedName' });
  changed = output<number>();
  selected = model<boolean>(false);

  bump(): void {
    this.changed.emit(this.count() + 1);
  }
}
