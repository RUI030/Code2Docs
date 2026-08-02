import { Component, afterRender, afterNextRender, ElementRef, inject } from '@angular/core';

@Component({ selector: 'x-scroll', template: '' })
export class ScrollComponent {
  private el = inject(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.el.nativeElement.scrollTop = 0;
    });
    afterRender(() => {
      this.el.nativeElement.style.display = 'block';
    });
  }
}
