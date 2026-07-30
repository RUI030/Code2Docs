import { Component, Optional, SkipSelf } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CacheService } from './cache.service';

@Component({ selector: 'x-reader', template: '' })
export class ReaderComponent {
  constructor(
    private http: HttpClient,
    protected route: ActivatedRoute,
    @Optional() @SkipSelf() private cache: CacheService,
  ) {}

  load(id: string) {
    return this.http.get(`/api/items/${id}`);
  }
}
