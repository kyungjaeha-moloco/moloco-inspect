import React from 'react';
import { Form, Formik } from 'formik';

export function FormikHarness({
  children,
  initialValues = {},
}: {
  children: React.ReactNode;
  initialValues?: Record<string, unknown>;
}) {
  return (
    <Formik initialValues={initialValues} onSubmit={() => {}}>
      <Form>{children}</Form>
    </Formik>
  );
}
