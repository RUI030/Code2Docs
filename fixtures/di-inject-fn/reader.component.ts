import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CacheService } from './cache.service';

@Component({ selector: 'x-reader', template: '' })
export class ReaderComponent {
  private http = inject(HttpClient);
  protected route = inject(ActivatedRoute);
  private cache = inject(CacheService, { optional: true, skipSelf: true });

  load(id: string) {
    return this.http.get(`/api/items/${id}`);
  }
}
