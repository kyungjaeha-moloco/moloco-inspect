import React from 'react';
import { Formik, Form } from 'formik';

interface FormikHarnessProps {
  initialValues?: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * Wraps children in a Formik context for form component previews.
 */
export function FormikHarness({
  initialValues = {},
  children,
}: FormikHarnessProps) {
  return (
    <Formik initialValues={initialValues} onSubmit={() => {}}>
      <Form>{children}</Form>
    </Formik>
  );
}
