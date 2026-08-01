import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FeedService {
  items(): Observable<string[]> {
    return of(['a', 'b']);
  }
}
