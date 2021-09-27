import {text, withKnobs} from '@storybook/addon-knobs';

import * as Preact from '#preact';

import {BentoImageSlider} from '../component';

export default {
  title: 'ImageSlider',
  component: BentoImageSlider,
  decorators: [withKnobs],
};

export const _default = () => {
  const first = text(
    'First image',
    'https://amp.dev/static/samples/img/canoe_900x600.jpg'
  );
  const second = text(
    'Second image',
    'https://amp.dev/static/samples/img/canoe_900x600_blur.jpg'
  );

  return (
    <BentoImageSlider
      initialSliderPosition={0}
      firstImageAs={(props) => (
        <img src={first} alt="A green apple" {...props} />
      )}
      firstLabelAs={(props) => <div {...props}>Clear picture</div>}
      secondImageAs={(props) => (
        <img src={second} alt="A red apple" {...props} />
      )}
      secondLabelAs={(props) => <div {...props}>Blur picture</div>}
      style={{width: 100, height: 200}}
    ></BentoImageSlider>
  );
};
