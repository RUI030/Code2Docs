<!-- code2docs:unit id="component:account/activate:ActivateComponent" tier="trivial" -->
<!-- GENERATED — trivial unit, no behavioral analysis. Rendered from signature.json by render-trivial.mjs -->

# Component: ActivateComponent

**Selector:** `jhi-activate`

> **Trivial unit.** This unit has no forms, streams, or HTTP interactions and fewer than 4 methods.
> A full behavioral analysis was not generated. If this unit requires documentation, run it through
> `/code2docs-pipeline` or reclassify it by editing the thresholds in `tools/classify-unit.mjs`.

## Public Contract

*(no public inputs, outputs, or methods)*

## Dependencies

- `ActivateService`
- `ActivatedRoute`

---

## S4 Behavioral Supplement

> Added by S4 bug-fix pass. The trivial classifier mis-classified this unit; it has HTTP behavior and spec tests that require documentation.

### Behavior

On initialization, this component calls activate.get with the key from URL query params — it reads `params.key` from the router and passes it to `ActivateService.get()`. (`activate.component.ts:22`)

The component should set success to true upon successful activation: when the activation service returns a successful response, the `success` signal is set to true and the screen displays the message "Your user account has been activated. Please sign in." with a link to the login page. (`activate.component.html:5–9`)

The component should set error to true upon activation failure: when the activation service returns an error, the `error` signal is set to true and the screen displays "Your user could not be activated. Please use the registration form to sign up." (`activate.component.html:11–15`)

### Screen Text

The "Activation" heading is always visible. The success alert contains "Your user account has been activated." followed by "Please" and a "sign in" link. The error alert contains "Your user could not be activated." and "Please use the registration form to sign up." (`activate.component.html:4,7,8,12`)
