import {withAmp} from '@ampproject/storybook-addon';
import {select, text, withKnobs} from '@storybook/addon-knobs';

import * as Preact from '#preact';

export default {
  title: 'amp-social-share-1_0',
  decorators: [withKnobs, withAmp],

  parameters: {
    extensions: [{name: 'amp-social-share', version: '1.0'}],
    experiments: ['bento'],
  },
};

export const Default = () => {
  /*
   * Knob and Component Details -
   * amp-social-share allows the user to set various parameters to configure
   * its behavior.  These parameters are controlled by storybook knobs and
   * are summarized below:
   *
   * Key Configuration Parameters -
   * type - This is a required attribute.  It configures a pre-configured set
   *   of parameters needed to share with a particular social-media.  Most
   *   notably, the share-endpoint is set by the type.  Configuration details
   *   can be found in amp-social-share-config.js.  The user may also select
   *   'custom' with this knob to manually specify the required parameters.
   *   Setting any of the other attributes below overwrites the
   *   pre-configured parameters defined by the type.
   * data-share-endpoint - This is the api endpoint of the social-media with
   *   which to share content.
   * data-param-url - This is the url to be shared via social-media.  It
   *   is defaulted to the canonical url of the current amp page in most
   *   cases where it is used in the pre-configured types.
   *
   * Other Configuration Parameters -
   * data-param-text - This is a text value included in the shared media.
   * data-param-attribution - This allows the user to specify where the
   *   share is attributed to.
   * data-param-media - This is used to specify a path to media (image) to
   *   be shared when sharing via Pinterest.
   * data-param-app_id - This is used when sharing with Facebook and is
   *   defaulted to an amp test app.
   */

  const typeConfigurations = [
    'email',
    'facebook',
    'linkedin',
    'pinterest',
    'tumblr',
    'twitter',
    'whatsapp',
    'line',
    'sms',
    'system',
    'custom',
    undefined,
  ];
  const type = select('type', typeConfigurations, typeConfigurations[0]);
  const customEndpoint = text('data-share-endpoint', null);
  const paramUrl = text('data-param-url', null);
  const paramText = text('data-param-text', null);
  const paramAttribution = text('data-param-attribution', null);
  const paramMedia = text('data-param-media', null);
  const appId = text('data-param-app_id', '254325784911610');
  const layout = text('layout', null);
  const width = text('width', null);
  const height = text('height', null);
  return (
    <amp-social-share
      type={type}
      data-share-endpoint={customEndpoint}
      data-param-text={paramText}
      data-param-url={paramUrl}
      data-param-attribution={paramAttribution}
      data-param-media={paramMedia}
      data-param-app_id={appId}
      layout={layout}
      width={width}
      height={height}
    ></amp-social-share>
  );
};

Default.storyName = 'default';
